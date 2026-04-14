import * as dotenv from 'dotenv';
dotenv.config();

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import 'reflect-metadata';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: [
      "http://localhost:5501",
      "http://127.0.0.1:5501"
    ],
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  });

  const port = Number(process.env.PORT) || 3001;

  await app.listen(port);

  console.log("🔥 SERVER IS LISTENING ON:", port);
}

bootstrap();