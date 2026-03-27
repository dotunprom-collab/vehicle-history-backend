import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ✅ ENABLE CORS (required for frontend)
  app.enableCors();

  // ✅ VERY IMPORTANT FOR RAILWAY
  const port = process.env.PORT || 3001;

  await app.listen(port, '0.0.0.0');

  console.log(`🚀 Server running on port ${port}`);
}

bootstrap();