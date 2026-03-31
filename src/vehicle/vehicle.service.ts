async getFullReport(reg: string) {
  try {
    return {
      make: "Test Car",
      year: 2020,
      fuel: "Petrol",
      colour: "Black",
      motStatus: "Valid"
    };
  } catch (error) {
    console.error("FULL REPORT ERROR:", error);
    return { error: "Failed to load full report" };
  }
}