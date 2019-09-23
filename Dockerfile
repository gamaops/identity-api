FROM node:12-stretch-slim

WORKDIR /usr/src/app

RUN apt update -y && \
	apt install -y git

COPY package*.json ./

RUN npm install --loglevel verbose

COPY . .

RUN npm run build

EXPOSE 35102
EXPOSE 32004

CMD [ "node", "build/index.js" ]