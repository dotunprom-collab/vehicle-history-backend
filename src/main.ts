import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as bodyParser from 'body-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: '*',
  });

  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: true }));

  // 🔥 HANDLE PREFLIGHT MANUALLY (FINAL FIX)
  app.options('*', (req, res) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', '*');
    res.sendStatus(204);
  });

  await app.listen(process.env.PORT || 3001, '0.0.0.0');
}

bootstrap();