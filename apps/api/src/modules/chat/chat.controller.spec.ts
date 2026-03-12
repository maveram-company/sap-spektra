import { Test, TestingModule } from '@nestjs/testing';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

const mockService = {
  processMessage: jest.fn(),
};

describe('ChatController', () => {
  let controller: ChatController;
  let service: ChatService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChatController],
      providers: [{ provide: ChatService, useValue: mockService }],
    }).compile();

    controller = module.get(ChatController);
    service = module.get(ChatService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ── chat (processMessage) ──

  describe('chat', () => {
    it('delegates to chatService.processMessage with orgId, message, and context', async () => {
      const expected = { reply: 'Hello! How can I help?' };
      mockService.processMessage.mockResolvedValue(expected);

      const dto = { message: 'Hi', context: { systemId: 'sys-1' } } as any;
      const result = await controller.chat('org-1', dto);

      expect(result).toEqual(expected);
      expect(service.processMessage).toHaveBeenCalledWith('org-1', 'Hi', {
        systemId: 'sys-1',
      });
    });

    it('passes undefined context when not provided', async () => {
      const expected = { reply: 'Sure thing' };
      mockService.processMessage.mockResolvedValue(expected);

      const dto = { message: 'Help me' } as any;
      const result = await controller.chat('org-1', dto);

      expect(result).toEqual(expected);
      expect(service.processMessage).toHaveBeenCalledWith(
        'org-1',
        'Help me',
        undefined,
      );
    });
  });
});
