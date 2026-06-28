import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,       // strip unknown fields from the body
      forbidNonWhitelisted: true, // reject requests that contain unknown fields
      transform: true,       // auto-cast body to DTO class instance
    }),
  );
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
