import * as dotenv from 'dotenv';
dotenv.config();

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import 'reflect-metadata';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors();

const port = Number(process.env.PORT) || 3000;

await app.listen(port);

console.log("🔥 SERVER IS LISTENING ON:", port);
}

bootstrap();