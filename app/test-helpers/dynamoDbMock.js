import { vi } from "vitest";

// Singleton mock function shared across all test files in the same process
export const mockSend = vi.fn();

export const mockDynamoDbClient = {
  send: mockSend,
};

export class MockPutCommand {
  constructor(input) {
    this.input = input;
  }
}
export class MockQueryCommand {
  constructor(input) {
    this.input = input;
  }
}
export class MockDeleteCommand {
  constructor(input) {
    this.input = input;
  }
}
export class MockGetCommand {
  constructor(input) {
    this.input = input;
  }
}
export class MockUpdateCommand {
  constructor(input) {
    this.input = input;
  }
}

export const mockLibDynamoDb = {
  DynamoDBDocumentClient: {
    from: () => mockDynamoDbClient,
  },
  PutCommand: MockPutCommand,
  QueryCommand: MockQueryCommand,
  DeleteCommand: MockDeleteCommand,
  GetCommand: MockGetCommand,
  UpdateCommand: MockUpdateCommand,
};

export const mockClientDynamoDb = {
  DynamoDBClient: class {
    constructor() {}
  },
};
