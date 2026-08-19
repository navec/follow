export interface ScheduledJobDefinition {
  id: string;
  expression: string;
  handler(): void | Promise<void>;
}
