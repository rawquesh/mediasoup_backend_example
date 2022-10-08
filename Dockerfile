FROM node:16 AS stage-one

ARG NPM_TOKEN
ARG NODE_ENV

RUN apt update -y
RUN apt install -y build-essential python3-pip

RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

COPY package.json .
RUN npm install

# copy all the files
ADD . .

EXPOSE 3000

CMD ["node", "index.js"]