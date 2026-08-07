import { Controller, Get } from '@nestjs/common';
import { HelpService } from './help.service';

@Controller('help')
export class HelpController {
  constructor(private helpService: HelpService) {}

  @Get('faqs')
  getFaqs() {
    return this.helpService.getFaqs();
  }

  @Get('privacy-policy')
  getPrivacyPolicy() {
    return this.helpService.getPrivacyPolicy();
  }

  @Get('terms')
  getTerms() {
    return this.helpService.getTerms();
  }
}
