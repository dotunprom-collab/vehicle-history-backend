import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ✅ ADD THIS LINE
  app.enableCors({
    origin: '*', // allow all (fine for MVP)
  });

  await app.listen(process.env.PORT || 3001);
}
bootstrap();