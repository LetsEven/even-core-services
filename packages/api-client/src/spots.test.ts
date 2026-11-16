import { describe, expect, it, vi } from "vitest";
import { fetchRestaurantTables } from "./spots";

function mockFetch(body: unknown, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({ ok, status, json: async () => body });
}

describe("fetchRestaurantTables", () => {
  it("normaliza, ordena de forma natural y quita duplicados", async () => {
    const fetch = mockFetch({
      success: true,
      data: [
        { table_number: "10", status: "occupied" },
        { table_number: "2", status: "available" },
        { table_number: 2, status: "occupied" },
        { table_number: "3", status: "reserved" },
        { table_number: "4", status: "raro" },
        { table_number: null, status: "available" },
      ],
    });
    const spots = await fetchRestaurantTables("https://api.test/api", 15, { fetch });
    expect(fetch.mock.calls[0][0]).toBe("https://api.test/api/restaurants/15/tables");
    expect(spots).toEqual([
      { id: "2", status: "available" },
      { id: "3", status: "reserved" },
      { id: "4", status: "unknown" },
      { id: "10", status: "occupied" },
    ]);
  });

  it("falla con HTTP de error", async () => {
    const fetch = mockFetch({}, false, 500);
    await expect(fetchRestaurantTables("https://api.test/api", 1, { fetch })).rejects.toThrow(
      "tables_request_failed_500",
    );
  });

  it("falla con respuesta inválida", async () => {
    const fetch = mockFetch({ success: false });
    await expect(fetchRestaurantTables("https://api.test/api", 1, { fetch })).rejects.toThrow(
      "tables_response_invalid",
    );
  });
});
