export interface MessageProvider {
  send(to: string, message: string): Promise<void>;
}
