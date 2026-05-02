import * as dotenv from 'dotenv';
dotenv.config();

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import 'reflect-metadata';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
  origin: [
    'https://www.cheapregcheck.com',
    'https://www.cheapregcheck.com',
  ],
});
  console.log("🚨 VERSION 2 DEPLOY CHECK");
  const port = Number(process.env.PORT) || 8080;
  await app.listen(port);
  console.log("🔥 SERVER IS LISTENING ON:", port);
}
bootstrap();