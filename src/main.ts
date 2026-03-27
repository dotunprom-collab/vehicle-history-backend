import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors();

  const port = process.env.PORT;

  if (!port) {
    throw new Error("❌ PORT is not defined");
  }

  await app.listen(Number(port), '0.0.0.0');

  console.log(`🚀 Server running on port ${port}`);
}

bootstrap();