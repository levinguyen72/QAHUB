import { Module } from '@nestjs/common';
import { IssuesModule } from '../issues/issues.module';
import { BoardsController } from './boards.controller';
import { BoardsService } from './boards.service';

@Module({ imports: [IssuesModule], controllers: [BoardsController], providers: [BoardsService] })
export class BoardsModule {}
