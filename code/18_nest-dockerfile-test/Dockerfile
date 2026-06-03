# 构建阶段：需要 devDependencies（含 @nest.js/cli、 typescript）才能 nest build
FROM node:24.15-alpine AS builder

WORKDIR /app

COPY package*.json ./

RUN npm config set registry https://registry.npmmirror.com/

RUN npm install

RUN npm install -g @nestjs/cli

# 复制项目所有代码到容器内
COPY . .

# 构建 Nest 项目（编译成 JS）
RUN npm run build



# 运行阶段：仅生产依赖 + 编译产物，镜像体积更小
# 指定基础镜像
FROM node:24.15-alpine

ENV NODE_ENV=production

WORKDIR /app

COPY package*.json ./

RUN npm config set registry https://registry.npmmirror.com/

RUN npm install --production

COPY --from=builder /app/dist ./dist


# 声明暴露端口（仅声明）
EXPOSE 3000

# 容器启动时执行的命令（启动 Nest 服务）
CMD [ "node", "dist/main.js" ]

