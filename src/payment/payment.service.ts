async getVehicle(reg: string) {
  return {
    reg,
    make: "TEST",
    year: 2020,
    fuel: "Petrol",
    colour: "Black",
    motStatus: "Valid",
  };
}