import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  console.log("🚀 BOOTSTRAP STARTING");

  const app = await NestFactory.create(AppModule);

  console.log("✅ APP CREATED");

  app.enableCors();

  const port = Number(process.env.PORT) || 3000;

  console.log("📡 ABOUT TO LISTEN ON:", port);

  await app.listen(port, '0.0.0.0');

  console.log("🔥 SERVER IS LISTENING ON:", port);
}

bootstrap();