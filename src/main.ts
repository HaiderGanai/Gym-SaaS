import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  // rawBody: Stripe webhook signature verification needs the unparsed request body
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,       // strip unknown fields from the body
      forbidNonWhitelisted: true, // reject requests that contain unknown fields
      transform: true,       // auto-cast body to DTO class instance
    }),
  );
  app.setGlobalPrefix('api/v1');
  app.enableCors();
  await app.listen(process.env.PORT ?? 4000);
}
bootstrap();
