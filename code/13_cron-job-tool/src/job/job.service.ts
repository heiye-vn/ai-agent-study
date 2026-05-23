import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { EntityManager } from 'typeorm';
import { Job } from './entities/job.entity';
import { CronJob } from 'cron';
import { JobAgentService } from 'src/ai/job-agent.service';

@Injectable()
export class JobService implements OnApplicationBootstrap {
  private readonly logger = new Logger(JobService.name);

  @Inject(JobAgentService)
  private readonly jobAgentService: JobAgentService;

  public onJobTrigger?: (job: Job) => Promise<void> | void;

  @Inject(EntityManager)
  private readonly entityManager: EntityManager;

  @Inject(SchedulerRegistry)
  private readonly schedulerRegistry: SchedulerRegistry;

  async onApplicationBootstrap() {
    const enabledJobs = await this.entityManager.find(Job, {
      where: { isEnabled: true },
    });
    const cronJobs = this.schedulerRegistry.getCronJobs();
    const intervals = this.schedulerRegistry.getIntervals();
    const timeouts = this.schedulerRegistry.getTimeouts();

    for (const job of enabledJobs) {
      const alreadyRegistered =
        (job.type === 'cron' && cronJobs.has(job.id)) ||
        (job.type === 'every' && intervals.includes(job.id)) ||
        (job.type === 'at' && timeouts.includes(job.id));

      if (alreadyRegistered) continue;

      await this.startRuntime(job);
    }
  }

  async listJobs() {
    const jobs = await this.entityManager.find(Job, {
      order: { createdAt: 'DESC' },
    });

    const cronJobs = this.schedulerRegistry.getCronJobs();
    const intervalNames = this.schedulerRegistry.getIntervals();
    const timeoutNames = this.schedulerRegistry.getTimeouts();

    return jobs.map((job) => {
      const running =
        job.isEnabled &&
        ((job.type === 'cron' && cronJobs.has(job.id)) ||
          (job.type === 'every' && intervalNames.includes(job.id)) ||
          (job.type === 'at' && timeoutNames.includes(job.id)));

      return {
        ...job,
        running,
      };
    });
  }

  async addJob(
    input:
      | { type: 'cron'; instruction: string; cron: string; isEnabled?: boolean }
      | { type: 'every'; instruction: string; everyMs: number; isEnabled?: boolean }
      | { type: 'at'; instruction: string; at: Date; isEnabled?: boolean }
  ) {
    const jobEntity = this.entityManager.create(Job, {
      type: input.type,
      instruction: input.instruction,
      cron: input.type === 'cron' ? input.cron : null,
      everyMs: input.type === 'every' ? input.everyMs : null,
      at: input.type === 'at' ? input.at : null,
      isEnabled: input.isEnabled ?? true,
      lastRun: null,
    });

    const saved = await this.entityManager.save(Job, jobEntity);

    if (saved.isEnabled) {
      await this.startRuntime(saved);
    }

    return saved;
  }

  async toggleJob(jobId: string, enabled?: boolean) {
    const job = await this.entityManager.findOne(Job, { where: { id: jobId } });
    if (!job) throw new NotFoundException(`Job not found: ${jobId}`);

    const nextEnabled = enabled ?? !job.isEnabled;
    if (job.isEnabled !== nextEnabled) {
      job.isEnabled = nextEnabled;
      await this.entityManager.save(Job, job);
    }

    if (job.isEnabled) {
      await this.startRuntime(job);
    } else {
      this.stopRuntime(job);
    }

    return job;
  }

  private async startRuntime(job: Job) {
    if (job.type === 'cron') {
      const cronJobs = this.schedulerRegistry.getCronJobs();
      const existing = cronJobs.get(job.id);
      if (existing) {
        existing.start();
        return;
      }

      const runtimeJob = this.createCronJob(job);
      this.schedulerRegistry.addCronJob(job.id, runtimeJob);
      runtimeJob.start();
      return;
    }

    if (job.type === 'every') {
      const names = this.schedulerRegistry.getIntervals();
      if (names.includes(job.id)) return;

      if (typeof job.everyMs !== 'number' || job.everyMs <= 0) {
        throw new Error(`Invalid everyMs for job ${job.id}`);
      }

      const ref = setInterval(async () => {
        this.logger.log(`run job ${job.id}, ${job.instruction}`);

        await this.entityManager.update(Job, job.id, { lastRun: new Date() });

        try {
          const result = await this.jobAgentService.runJob(job.instruction);
          this.logger.log(`[job ${job.id} ${result}]`);
        } catch (error) {
          this.logger.error(`job ${job.id} agent execute error: ${(error as Error).message}`);
        }
      }, job.everyMs);

      this.schedulerRegistry.addInterval(job.id, ref);
      return;
    }

    if (job.type === 'at') {
      const names = this.schedulerRegistry.getTimeouts();
      if (names.includes(job.id)) return;

      if (!job.at) {
        throw new Error(`Invalid at for job ${job.id}`);
      }

      const delay = Math.max(0, job.at.getTime() - Date.now());
      const ref = setTimeout(async () => {
        this.logger.log(`run job ${job.id}, ${job.instruction}`);
        await this.entityManager.update(Job, job.id, {
          lastRun: new Date(),
          isEnabled: false, // at 类型只执行一次，执行完自动停用
        });
        try {
          const result = await this.jobAgentService.runJob(job.instruction);
          this.logger.log(`[job ${job.id} ${result}]`);
        } catch (error) {
          this.logger.error(`job ${job.id} agent execute error: ${(error as Error).message}`);
        }
      }, delay);

      this.schedulerRegistry.addTimeout(job.id, ref);
      return;
    }
  }

  private stopRuntime(job: Job) {
    if (job.type === 'cron') {
      const cronJobs = this.schedulerRegistry.getCronJobs();
      const runtimeJob = cronJobs.get(job.id);
      if (runtimeJob) runtimeJob.stop();
      return;
    }

    if (job.type === 'every') {
      try {
        this.schedulerRegistry.deleteInterval(job.id);
      } catch (error) {
        this.logger.warn(`Failed to delete interval for job ${job.id}`, error);
      }
      return;
    }

    if (job.type === 'at') {
      try {
        this.schedulerRegistry.deleteTimeout(job.id);
      } catch (error) {
        this.logger.warn(`Failed to delete timeout for job ${job.id}`, error);
      }
      return;
    }
  }

  private createCronJob(job: Job) {
    if (!job.cron) {
      throw new Error(`Missing cron expression for job ${job.id}`);
    }
    return new CronJob(job.cron, async () => {
      this.logger.log(`run job ${job.id}, ${job.instruction}`);
      await this.entityManager.update(Job, job.id, { lastRun: new Date() });

      try {
        const result = await this.jobAgentService.runJob(job.instruction);
        this.logger.log(`[job ${job.id} ${result}]`);
      } catch (error) {
        this.logger.error(`job ${job.id} agent execute error: ${(error as Error).message}`);
      }
    });
  }
}
