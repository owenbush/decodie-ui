export function notifyListeners(event: string, data: unknown): void {
  // Observer pattern implementation
  console.log(`Event: ${event}`, data);
}
