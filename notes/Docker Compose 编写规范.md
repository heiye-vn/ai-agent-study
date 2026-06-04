# Docker Compose 编写规范

> 本文档提供了 Docker Compose 的最佳实践、编写规范和环境变量使用方法。

---

## 📋 目录

1. [文件结构规范](#一、文件结构规范)
2. [docker-compose.yml 标准模板](#二、docker-composeyml-标准模板)
3. [.env 文件规范](#三、env-文件规范)
4. [环境变量使用规则](#四、环境变量使用规则)
5. [命名规范](#五、命名规范)
6. [安全规范](#六、安全规范)
7. [健康检查规范](#七、健康检查规范)
8. [依赖管理与多容器编排](#八、依赖管理与多容器编排)
9. [端口映射与网络规范](#九、端口映射与网络规范)
10. [数据卷挂载规范](#十、数据卷挂载规范 (Volumes))
11. [多项目隔离](#十一、多项目隔离)
12. [常用命令速查](#十二、常用命令速查)
13. [最佳实践总结](#🎯 最佳实践总结)
14. [参考资源](#📚 参考资源)

---

## 一、文件结构规范

### 推荐的项目结构

```bash
project/
├── docker-compose.yml          # 主配置文件
├── docker-compose.override.yml # 本地开发覆盖配置（可选）
├── .env                        # 环境变量文件（不提交到 Git）
├── .env.example                # 环境变量模板（提交到 Git）
├── .dockerignore               # Docker 忽略文件
└── services/                   # 服务相关配置
    ├── mysql/
    │   └── init.sql           # 初始化脚本
    └── nginx/
        └── nginx.conf         # Nginx 配置
```

### 关键文件说明

- **docker-compose.yml**: 主要配置文件，定义所有服务
- **.env**: 存储敏感信息和环境变量（**不要提交到 Git**）
- **.env.example**: 环境变量模板，包含示例值（**提交到 Git**）
- **.gitignore**: 确保 `.env` 文件不被提交

---

## 二、 docker-compose.yml 标准模板

```yaml
# ============================================
# Docker Compose 配置文件
# 版本：3.8（推荐，兼容性最好）
# ============================================

version: '3.8'

# 可选：自定义项目名称（默认是目录名）
name: ${PROJECT_NAME:-my-project}

# ============================================
# 服务定义
# ============================================
services:
  # ------------------------------------------
  # MySQL 数据库
  # ------------------------------------------
  mysql:
    image: mysql:${MYSQL_VERSION:-8.0} # 使用环境变量，带默认值
    container_name: ${PROJECT_NAME}-mysql # 容器命名规范：项目名-服务名
    restart: unless-stopped # 重启策略

    # 端口映射：宿主机端口:容器端口
    ports:
      - '${MYSQL_PORT:-3306}:3306'

    # 环境变量（敏感信息从 .env 读取）
    environment:
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD}
      MYSQL_DATABASE: ${MYSQL_DATABASE}
      MYSQL_USER: ${MYSQL_USER}
      MYSQL_PASSWORD: ${MYSQL_PASSWORD}
      TZ: Asia/Shanghai

    # 数据卷挂载
    volumes:
      - mysql-data:/var/lib/mysql # 命名卷（推荐）
      - ./services/mysql/init.sql:/docker-entrypoint-initdb.d/init.sql # 初始化脚本

    # 健康检查
    healthcheck:
      test: ['CMD', 'mysqladmin', 'ping', '-h', 'localhost']
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s

    # 网络
    networks:
      - app-network

    # 资源限制
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 1G
        reservations:
          cpus: '0.5'
          memory: 512M

  # ------------------------------------------
  # Redis 缓存
  # ------------------------------------------
  redis:
    image: redis:${REDIS_VERSION:-7-alpine}
    container_name: ${PROJECT_NAME}-redis
    restart: unless-stopped
    ports:
      - '${REDIS_PORT:-6379}:6379'
    volumes:
      - redis-data:/data
    command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD}
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - app-network

  # ------------------------------------------
  # Elasticsearch
  # ------------------------------------------
  elasticsearch:
    image: elasticsearch:${ES_VERSION:-8.17.0}
    container_name: ${PROJECT_NAME}-es
    restart: unless-stopped
    ports:
      - '${ES_PORT:-9200}:9200'
    environment:
      - discovery.type=single-node
      - xpack.security.enabled=false
      - xpack.security.http.ssl.enabled=false
      - ES_JAVA_OPTS=-Xms512m -Xmx512m
    volumes:
      - es-data:/usr/share/elasticsearch/data
    healthcheck:
      test: ['CMD-SHELL', 'curl -f http://localhost:9200 || exit 1']
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 60s
    networks:
      - app-network

  # ------------------------------------------
  # Kibana
  # ------------------------------------------
  kibana:
    image: kibana:${KIBANA_VERSION:-8.17.0}
    container_name: ${PROJECT_NAME}-kibana
    restart: unless-stopped
    ports:
      - '${KIBANA_PORT:-5601}:5601'
    environment:
      - ELASTICSEARCH_HOSTS=http://${PROJECT_NAME}-es:9200 # 使用容器名通信
    depends_on:
      elasticsearch:
        condition: service_healthy # 等待 ES 健康检查通过
    networks:
      - app-network

  # ------------------------------------------
  # Milvus 向量数据库
  # ------------------------------------------
  milvus:
    image: milvusdb/milvus:${MILVUS_VERSION:-v2.3.0}
    container_name: ${PROJECT_NAME}-milvus
    restart: unless-stopped
    ports:
      - '${MILVUS_PORT:-19530}:19530'
      - '${MILVUS_MONITOR_PORT:-9091}:9091'
    environment:
      - ETCD_USE_EMBED=false
      - ETCD_ENDPOINTS=${PROJECT_NAME}-etcd:2379
      - MINIO_ADDRESS=${PROJECT_NAME}-minio:9000
      - COMMON_STORAGETYPE=minio
    volumes:
      - milvus-data:/var/lib/milvus
    depends_on:
      - etcd
      - minio
    command: ['milvus', 'run', 'standalone']
    networks:
      - app-network

  # Etcd（Milvus 依赖）
  etcd:
    image: quay.io/coreos/etcd:v3.5.5
    container_name: ${PROJECT_NAME}-etcd
    environment:
      - ETCD_AUTO_COMPACTION_MODE=revision
      - ETCD_AUTO_COMPACTION_RETENTION=1000
    volumes:
      - etcd-data:/etcd
    command: etcd -advertise-client-urls=http://127.0.0.1:2379 -listen-client-urls http://0.0.0.0:2379 --data-dir /etcd
    networks:
      - app-network

  # MinIO（Milvus 对象存储）
  minio:
    image: minio/minio:RELEASE.2023-03-20T20-16-18Z
    container_name: ${PROJECT_NAME}-minio
    environment:
      MINIO_ACCESS_KEY: ${MINIO_ACCESS_KEY}
      MINIO_SECRET_KEY: ${MINIO_SECRET_KEY}
    volumes:
      - minio-data:/minio_data
    command: minio server /minio_data
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:9000/minio/health/live']
      interval: 30s
      timeout: 20s
      retries: 3
    networks:
      - app-network

  # ------------------------------------------
  # 应用服务（示例）
  # ------------------------------------------
  app:
    build:
      context: . # 构建上下文
      dockerfile: Dockerfile # Dockerfile 路径
    container_name: ${PROJECT_NAME}-app
    restart: unless-stopped
    ports:
      - '${APP_PORT:-3000}:3000'
    environment:
      - NODE_ENV=${NODE_ENV:-production}
      - DATABASE_URL=mysql://${MYSQL_USER}:${MYSQL_PASSWORD}@${PROJECT_NAME}-mysql:3306/${MYSQL_DATABASE}
      - REDIS_URL=redis://:${REDIS_PASSWORD}@${PROJECT_NAME}-redis:6379
      - MILVUS_URI=http://${PROJECT_NAME}-milvus:19530
      - ES_URL=http://${PROJECT_NAME}-es:9200
    depends_on:
      mysql:
        condition: service_healthy
      redis:
        condition: service_healthy
      milvus:
        condition: service_started
    volumes:
      - app-logs:/app/logs
    networks:
      - app-network

# ============================================
# 数据卷定义（命名卷）
# ============================================
volumes:
  mysql-data:
    driver: local
  redis-data:
    driver: local
  es-data:
    driver: local
  milvus-data:
    driver: local
  etcd-data:
    driver: local
  minio-data:
    driver: local
  app-logs:
    driver: local

# ============================================
# 网络定义
# ============================================
networks:
  app-network:
    driver: bridge
    name: ${PROJECT_NAME}-network # 自定义网络名称
```

---

## 三、env 文件规范

**.env（不提交到 Git，添加到 .gitignore）**

```bash
# ============================================
# 项目配置
# ============================================
PROJECT_NAME=my-app

# ============================================
# MySQL 配置
# ============================================
MYSQL_VERSION=8.0
MYSQL_PORT=3306
MYSQL_ROOT_PASSWORD=your_secure_root_password
MYSQL_DATABASE=app_db
MYSQL_USER=app_user
MYSQL_PASSWORD=your_secure_password

# ============================================
# Redis 配置
# ============================================
REDIS_VERSION=7-alpine
REDIS_PORT=6379
REDIS_PASSWORD=your_secure_redis_password

# ============================================
# Elasticsearch & Kibana 配置
# ============================================
ES_VERSION=8.17.0
ES_PORT=9200
KIBANA_VERSION=8.17.0
KIBANA_PORT=5601

# ============================================
# Milvus 配置
# ============================================
MILVUS_VERSION=v2.3.0
MILVUS_PORT=19530
MILVUS_MONITOR_PORT=9091
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin

# ============================================
# 应用配置
# ============================================
APP_PORT=3000
NODE_ENV=production
```

**.env.example（提交到 Git，作为模板）**

```bash
# 复制此文件为 .env 并填写实际值
# cp .env.example .env

PROJECT_NAME=my-app

MYSQL_ROOT_PASSWORD=change_me
MYSQL_DATABASE=app_db
MYSQL_USER=app_user
MYSQL_PASSWORD=change_me

REDIS_PASSWORD=change_me

MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin

NODE_ENV=production
```

---

## 四、环境变量使用规则

### 规则1：基本语法

```yaml
# 方式 A：直接引用（必须存在）
environment:
  DB_PASSWORD: ${DB_PASSWORD}

# 方式 B：带默认值（推荐）
environment:
  DB_PASSWORD: ${DB_PASSWORD:-default_password}

# 方式 C：使用 compose 内部的变量
environment:
  DB_HOST: ${PROJECT_NAME}-mysql
```

### 规则2：在 different 位置使用变量

```yaml
version: '3.8'

name: ${PROJECT_NAME:-my-project} # ✅ 在项目级别使用

services:
  mysql:
    image: mysql:${MYSQL_VERSION:-8.0} # ✅ 在镜像标签中使用
    container_name: ${PROJECT_NAME}-mysql # ✅ 在容器名中使用
    ports:
      - '${MYSQL_PORT:-3306}:3306' # ✅ 在端口映射中使用
    environment:
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD} # ✅ 在环境变量中使用
    volumes:
      - ${DATA_DIR:-./data}/mysql:/var/lib/mysql # ✅ 在卷路径中使用
```

### 规则3：多环境配置

**docker-compose.dev.yml（开发环境覆盖）**

```yaml
version: '3.8'

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile.dev
    environment:
      - NODE_ENV=development
      - DEBUG=true
    volumes:
      - .:/app # 代码热重载
      - /app/node_modules
    ports:
      - '9229:9229' # Node.js 调试端口

  mysql:
    ports:
      - '3306:3306' # 开发环境暴露端口
```

**启动命令：**

```bash
# 开发环境
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d

# 生产环境
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

---

## 五、命名规范

### 容器命名

```yaml
# ✅ 推荐：项目名-服务名
container_name: ${PROJECT_NAME}-mysql

# ❌ 避免：硬编码名称
container_name: my-mysql-container
```

### 服务命名

```yaml
# ✅ 推荐：使用小写字母和连字符
services:
  user-service:
  order-service:

# ❌ 避免：驼峰或下划线
services:
  UserService:
  order_service:
```

### 网络命名

```yaml
# ✅ 推荐：项目名-network
networks:
  app-network:
    name: ${PROJECT_NAME}-network
```

### 卷命名

```yaml
# ✅ 推荐：服务名-data
volumes:
  mysql-data:
  redis-data:
```

---

## 六、安全规范

### 规则 1：敏感信息不要硬编码

```yaml
# ❌ 错误：密码硬编码
environment:
  MYSQL_ROOT_PASSWORD: password123

# ✅ 正确：从 .env 读取
environment:
  MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD}
```

### 规则 2：使用 Docker Secrets（生产环境）

```yaml
version: '3.8'

services:
  mysql:
    image: mysql:8.0
    secrets:
      - db_password
    environment:
      MYSQL_ROOT_PASSWORD_FILE: /run/secrets/db_password

secrets:
  db_password:
    file: ./secrets/db_password.txt
```

### 规则 3：限制资源使用

````yaml
deploy:
  resources:
    limits:
      cpus: '1.0'
      memory: 1G
    reservations:
      cpus: '0.5'
      memory: 512M
````

### 规则 4：不要暴露不必要的端口

```yaml
# ❌ 错误：所有端口都暴露
ports:
  - "3306:3306"
  - "9200:9200"

# ✅ 正确：只暴露需要的端口，内部服务通过容器名通信
ports:
  - "3306:3306"  # 只暴露 MySQL
# Elasticsearch 通过容器名访问，不暴露端口
```

---

## 七、健康检查规范

### 基本格式

```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
  interval: 30s        # 每 30 秒检查一次
  timeout: 10s         # 超时时间
  retries: 3           # 重试次数
  start_period: 40s    # 启动宽限期（容器启动后多久开始检查）
```

### 常见服务的健康检查

```yaml
# MySQL
healthcheck:
  test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
  interval: 10s
  timeout: 5s
  retries: 5
  start_period: 30s

# Redis
healthcheck:
  test: ["CMD", "redis-cli", "ping"]
  interval: 10s
  timeout: 5s
  retries: 5

# PostgreSQL
healthcheck:
  test: ["CMD-SHELL", "pg_isready -U postgres"]
  interval: 10s
  timeout: 5s
  retries: 5

# Elasticsearch
healthcheck:
  test: ["CMD-SHELL", "curl -f http://localhost:9200 || exit 1"]
  interval: 30s
  timeout: 10s
  retries: 5
  start_period: 60s

# HTTP 服务
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
  interval: 30s
  timeout: 10s
  retries: 3
```

---

## 八、依赖管理与多容器编排

依赖管理决定了服务之间的**启动和就绪顺序**，是复杂项目编排的核心。

### 8.1 编写规则

1. **区分“启动”与“就绪”**：
   - 默认的 `depends_on` 仅保证依赖的容器**已启动**（即 Docker 进程在运行），但不保证容器内的应用程序已经能够提供服务。
   - 强烈推荐结合 `healthcheck`，使用 `condition: service_healthy` 的高级语法来控制就绪顺序。
2. **多依赖顺序**：当应用服务同时依赖数据库、Redis 和搜索引擎时，应在 `depends_on` 中列出所有依赖，确保整个微服务体系的拓扑是有序的。

### 8.2 实际项目应用（以 Kibana 依赖 ES 为例）

在我们的 [docker-compose.yml](file:///d:/ZSP/Study/Ai%20Agent/ai-agent-study/code/19_elastic-search-test/docker-compose.yml) 中，Kibana 需要连接并使用 ES。如果 ES 还没就绪，Kibana 就会在启动时抛出连接异常甚至直接崩溃。

**❌ 不推荐写法（仅等待容器启动）：**

```yaml
kibana:
  image: kibana:8.17.0
  depends_on:
    - es # ES 容器一启动，Kibana 就会立即启动，此时 ES 运行尚未初始化完毕，导致 Kibana 报错
```

**✅ 推荐写法（配合健康检查）：**

```yaml
es:
  image: elasticsearch:8.17.0
  # ... 配置上述的 healthcheck ...

kibana:
  image: kibana:8.17.0
  depends_on:
    es:
      condition: service_healthy # 严格等待 ES 健康检查通过后再启动 Kibana
```

---

## 九、端口映射与网络规范

### 9.1 端口映射规范 (Ports)

**格式规范**：`"宿主机端口:容器端口"`。

```yaml
ports:
  - '3307:3306'  # 左边是宿主机端口（可改），右边是容器内部端口（固定）
```

- **容器内部端口**：服务在容器内监听的端口，通常**不建议改**
- **宿主机端口**：外部访问时使用的端口，**可以随意修改**

**生产安全红线**：

- 在生产环境，数据库（MySQL、Redis 等）和敏感服务**禁止**直接将端口映射到宿主机的公网 IP（例如 `3306:3306`），防止被扫描爆破。
- 若本地需要调试，应将端口绑定在 `127.0.0.1`（例如 `"127.0.0.1:3306:3306"`），只允许宿主机本地访问。
- 服务间通信应仅通过 Docker 内部网络进行，无需对外映射端口。

### 9.2 常见服务默认端口

| 服务          | 默认端口 | 说明          |
| ------------- | -------- | ------------- |
| MySQL         | 3306     | 数据库        |
| PostgreSQL    | 5432     | 数据库        |
| Redis         | 6379     | 缓存          |
| MongoDB       | 27017    | 文档数据库    |
| Elasticsearch | 9200     | HTTP API      |
| Elasticsearch | 9300     | 节点通信      |
| Kibana        | 5601     | Web 界面      |
| Milvus        | 19530    | gRPC API      |
| Milvus        | 9091     | 监控端口      |
| MinIO         | 9000     | S3 API        |
| MinIO         | 9001     | Console       |
| RabbitMQ      | 5762     | AMQP          |
| RabbitMQ      | 15672    | Management UI |

### 9.3 多容器网络编排 (Networks)

**服务发现机制**：同一网络下的容器可以通过**服务名**进行通信，DNS 解析由 Docker 自动完成。例如在我们的 [docker-compose.yml](file:///d:/ZSP/Study/Ai%20Agent/ai-agent-study/code/19_elastic-search-test/docker-compose.yml) 中，Kibana 连接 ES 的地址为 `http://es:9200`，其中的 `es` 就是 Docker 网络中的服务名。

**自定义网络**：建议使用显式命名的自定义网络，以便于多项目互联或隔离。

**外部网络共享 (External Network)**：

- 若要实现不同 `docker-compose` 项目之间的容器互通，应定义外部共享网络。
- 在我们的 [docker-compose.yml](file:///d:/ZSP/Study/Ai%20Agent/ai-agent-study/code/19_elastic-search-test/docker-compose.yml) 中：
  ```yaml
  networks:
    default:
      name: common-network # 将项目默认网络命名为全局共享的 common-network
  ```

---

## 十、数据卷挂载规范 (Volumes)

数据卷挂载用于实现容器的**数据持久化**与**配置共享**。

### 10.1 挂载方式对比

Docker 主要支持以下两种挂载方式：

| 挂载方式                     | 定义语法示例                                   | 适用场景                                                             | 优缺点                                                                                                        |
| :--------------------------- | :--------------------------------------------- | :------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------ |
| **绑定挂载**<br>(Bind Mount) | `- ./volumes/es:/usr/share/elasticsearch/data` | **开发环境**：代码热重载、配置文件共享、本地直接查看日志。           | **优点**：直接在宿主机修改生效。<br>**缺点**：依赖宿主机路径，跨平台兼容性差（Windows/Linux 路径差异）。      |
| **命名卷**<br>(Named Volume) | `- mysql-data:/var/lib/mysql`                  | **生产环境**、**公共数据库数据持久化**。不需要宿主机直接干预的数据。 | **优点**：Docker 统一管理，性能更好，跨平台兼容，无路径问题。<br>**缺点**：在宿主机上无法直接查看和编辑文件。 |

### 10.2 编写规则

1. **数据库数据必须挂载**：凡是产生持久化数据的容器（MySQL、Elasticsearch、Milvus 等），必须将其数据目录挂载到宿主机或命名卷中，严禁容器被销毁后数据丢失。
2. **防路径硬编码**：在不同开发者（如 Windows 与 macOS/Linux 混合开发）的环境中，宿主机目录不同。在需要绑定挂载时，建议使用环境变量作为基准路径：
   ```yaml
   volumes:
     - ${DOCKER_VOLUME_DIRECTORY:-.}/volumes/es:/usr/share/elasticsearch/data
   ```
   _注：在我们的 [docker-compose.yml](file:///d:/ZSP/Study/Ai%20Agent/ai-agent-study/code/19_elastic-search-test/docker-compose.yml) 中使用 `${DOCKER_VOLUME_DIRECTORY:-.}` 表示：若宿主机配置了此环境变量则使用它，否则默认使用当前 compose 文件所在目录（`.`），可完美适配 Windows 与 Linux 的不同挂载目录。_
3. **只读挂载保护**：对于仅仅需要容器读取的配置文件（如 `nginx.conf`、初始化 SQL 脚本等），在挂载时应加上 `:ro`（Read-Only）标记，防止容器内部程序意外修改宿主机文件：
   ```yaml
   volumes:
     - ./services/mysql/init.sql:/docker-entrypoint-initdb.d/init.sql:ro
   ```

---

## 十一、多项目隔离

1. **项目名称隔离**：
   - 默认情况下，Docker Compose 会以当前目录名作为**项目名前缀**（Project Name）来命名网络和容器。
   - 推荐在 `docker-compose.yml` 的顶层定义 `name` 属性，或在 `.env` 中指定 `COMPOSE_PROJECT_NAME`（或使用 `PROJECT_NAME` 自定义变量），确保即使重命名项目目录，容器和卷也不会发生冲突或丢失。
   ```yaml
   name: ${PROJECT_NAME:-my-project}
   ```
2. **命名冲突预防**：
   - 使用 `container_name` 时，确保名字加上了 `${PROJECT_NAME}-` 前缀。
   - 如果不使用 `container_name`，Docker 会自动以 `[项目名]-[服务名]-[副本序号]` 命名，这能更好地防止多项目或多实例启动时的命名冲突。

### 多项目端口规划方案

**方案A：按项目分配端口**

```bash
项目 A（开发环境）:
  MySQL:      3306
  Redis:      6379
  Milvus:     19530
  ES:         9200
  Kibana:     5601

项目 B（测试环境）:
  MySQL:      3316  (+10)
  Redis:      6389  (+10)
  Milvus:     19540 (+10)
  ES:         9210  (+10)
  Kibana:     5611  (+10)

项目 C（生产模拟）:
  MySQL:      3326  (+20)
  Redis:      6399  (+20)
  Milvus:     19550 (+20)
  ES:         9220  (+20)
  Kibana:     5621  (+20)
```

**方案B：使用 .env 文件管理（推荐）**

```bash
# project-a/.env

PROJECT_NAME=project-a
MYSQL_PORT=3306
REDIS_PORT=6379
MILVUS_PORT=19530
ES_PORT=9200
KIBANA_PORT=5601
```

```bash
# project-b/.env

PROJECT_NAME=project-b
MYSQL_PORT=3316
REDIS_PORT=6389
MILVUS_PORT=19540
ES_PORT=9210
KIBANA_PORT=5611
```



---

## 十二、常用命令速查

### 基础命令

```bash
# 启动服务（后台运行）
docker compose up -d

# 启动服务（前台运行，查看日志）
docker compose up

# 停止服务
docker compose down

# 停止并删除数据卷
docker compose down -v

# 停止并删除所有（包括镜像）
docker compose down -v --rmi all

# 重启服务
docker compose restart

# 重新构建并启动
docker compose up -d --build
```

### 查看信息

```yaml
# 查看运行状态
docker compose ps

# 查看日志
docker compose logs

# 实时查看日志
docker compose logs -f

# 查看特定服务日志
docker compose logs -f mysql

# 查看配置（验证 YAML 是否正确）
docker compose config

# 查看环境变量解析结果
docker compose config | grep environment
```

### 服务管理

```yaml
# 进入容器
docker compose exec mysql bash
docker compose exec redis redis-cli

# 执行命令
docker compose exec mysql mysql -u root -p
docker compose exec redis redis-cli ping

# 停止特定服务
docker compose stop mysql

# 启动特定服务
docker compose start mysql

# 重启特定服务
docker compose restart mysql
```

### 项目管理

```yaml
# 指定项目名称
docker compose -p my-project up -d

# 使用多个配置文件
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d

# 查看某个项目的容器
docker compose -p project-a ps
```

### 数据管理

```yaml
# 查看数据卷
docker volume ls

# 删除未使用的数据卷
docker volume prune

# 备份数据卷
docker run --rm -v mysql-data:/data -v $(pwd):/backup alpine tar czf /backup/mysql-backup.tar.gz -C /data .

# 恢复数据卷
docker run --rm -v mysql-data:/data -v $(pwd):/backup alpine tar xzf /backup/mysql-backup.tar.gz -C /data
```

### 故障排查

```yaml
# 查看容器详细信息
docker inspect <container_name>

# 查看容器资源使用
docker stats

# 查看端口占用（Mac/Linux）
lsof -i -P -n | grep LISTEN

# 查看端口占用（Windows）
netstat -ano | findstr "LISTENING"

# 检查特定端口
lsof -i :3306
netstat -ano | findstr "3306"
```

---

## 🎯 最佳实践总结

### ✅ 应该做的

1. **使用 .env 文件管理环境变量**，不要硬编码敏感信息
2. **使用命名卷**而不是绑定挂载（除非需要访问宿主机文件）
3. **添加健康检查**，确保服务依赖正确
4. **设置重启策略**（`unless-stopped` 或 `always`）
5. **限制资源使用**，避免单个容器占用过多资源
6. **使用自定义网络**，实现服务隔离
7. **提供 .env.example** 作为配置模板
8. **将 .env 加入 .gitignore**，保护敏感信息
9. **使用条件依赖**（`service_healthy`）而不是简单依赖
10. **文档化端口和服务**，方便团队协作

### ❌ 不应该做的

1. **不要硬编码密码**在 docker-compose.yml 中
2. **不要暴露不必要的端口**到宿主机
3. **不要在生产环境使用** `xpack.security.enabled=false`
4. **不要使用 latest 标签**，指定具体版本号
5. **不要在容器中存储重要数据**，使用卷持久化
6. **不要忽略健康检查**，特别是对于有依赖的服务
7. **不要在同一台机器上**使用相同端口运行多个相同服务

---

## 📚 参考资源

- [Docker Compose 官方文档](https://docs.docker.com/compose/)
- [Docker Compose 文件参考](https://docs.docker.com/compose/compose-file/)
- [Docker 最佳实践](https://docs.docker.com/develop/dev-best-practices/)
- [Docker 安全最佳实践](https://docs.docker.com/engine/security/)
