import * as dotenv from 'dotenv';
dotenv.config();

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import 'reflect-metadata';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

app.enableCors({
  origin: "*", // 🔥 allow your frontend
  methods: "GET,POST,PUT,DELETE",
  allowedHeaders: "Content-Type,Authorization",
});

  app.enableCors();

const port = Number(process.env.PORT) || 3001;

await app.listen(port);

console.log("🔥 SERVER IS LISTENING ON:", port);
console.log("🔥 GLOBAL ENV:", process.env.STRIPE_SECRET_KEY);
}

bootstrap();