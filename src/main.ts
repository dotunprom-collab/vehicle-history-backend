import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    cors: {
      origin: '*',
      methods: ['GET','HEAD','PUT','PATCH','POST','DELETE','OPTIONS'],
      allowedHeaders: '*',
    },
  });

  // ✅ IMPORTANT (your frontend uses /api/v1)
  app.setGlobalPrefix('api/v1');

  await app.listen(process.env.PORT || 3001, '0.0.0.0');
}

bootstrap();