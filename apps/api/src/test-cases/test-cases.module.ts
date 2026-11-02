import { Module } from '@nestjs/common';
import { ExcelService } from './excel.service';
import { RequirementsService } from './requirements.service';
import { TestCasesController } from './test-cases.controller';
import { TestCasesService } from './test-cases.service';

@Module({ controllers: [TestCasesController], providers: [RequirementsService, TestCasesService, ExcelService], exports: [TestCasesService] })
export class TestCasesModule {}
