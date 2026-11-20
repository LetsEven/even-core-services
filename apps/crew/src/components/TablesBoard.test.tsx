// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";

const api = vi.hoisted(() => ({
  getRoomsForBranch: vi.fn(async () => []),
  getTablesForBranch: vi.fn(async () => [
    {
      id: "t1",
      table_number: "7",
      status: "available",
      has_open_account: false,
      has_tap_pay_account: false,
    },
  ]),
  openTableAccount: vi.fn(),
  peekTablePOS: vi.fn(async () => false),
  peekTablePOSBatch: vi.fn(async () => []),
  reorderRooms: vi.fn(),
  reorderTables: vi.fn(),
  syncFlexBillTableFromPOS: vi.fn(),
}));
vi.mock("../services/api", () => api);

import { AuthContext, type AuthProvider } from "../lib/auth";
import { DEFAULT_CREW_CONFIG } from "../features/config/crewConfig";
import TablesBoard from "./TablesBoard";

const auth: AuthProvider = {
  kind: "local",
  status: "signedIn",
  user: null,
  getToken: async () => "t",
  signOut: async () => {},
  hasPermission: () => false,
};

function Where() {
  return <div data-testid="where">{useLocation().pathname}</div>;
}

afterEach(cleanup);

describe("TablesBoard", () => {
  it("mesa libre navega a la cuenta (Abrir cuenta), no directo a la comanda", async () => {
    render(
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={["/mesas"]}>
          <Routes>
            <Route
              path="*"
              element={
                <>
                  <TablesBoard
                    branchId="b1"
                    branches={[]}
                    branchesLoading={false}
                    orders={[]}
                    activeOrderTypes={["flex_bill"]}
                    crewConfig={DEFAULT_CREW_CONFIG}
                    onOrdersRefresh={() => {}}
                  />
                  <Where />
                </>
              }
            />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>,
    );
    fireEvent.click(await screen.findByLabelText(/Mesa 7/));
    await vi.waitFor(() =>
      expect(screen.getByTestId("where").textContent).toBe("/mesas/7"),
    );
  });
});
