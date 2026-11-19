import { Module } from '@nestjs/common';
import { HepaidService } from './hepaid.service';

@Module({
  providers: [HepaidService],
  exports: [HepaidService],
})
export class HepaidModule {}
