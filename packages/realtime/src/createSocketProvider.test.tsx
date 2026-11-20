// @vitest-environment jsdom
import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSocketProvider,
  type SocketContextType,
} from "./createSocketProvider";

type Handler = (...args: unknown[]) => void;
const fake = vi.hoisted(() => ({
  handlers: {} as Record<string, Handler>,
  emit: vi.fn(),
  disconnect: vi.fn(),
  options: undefined as unknown,
}));
vi.mock("socket.io-client", () => ({
  io: (_url: string, options: unknown) => {
    fake.options = options;
    return {
      connected: false,
      on: (event: string, handler: Handler) => {
        fake.handlers[event] = handler;
      },
      emit: fake.emit,
      disconnect: fake.disconnect,
    };
  },
}));

function setup(overrides: { isGuest?: boolean; user?: unknown } = {}) {
  const { SocketProvider, useSocketContext } = createSocketProvider({
    clientType: "demo",
    eventPrefix: "table",
    appLabel: "Demo",
    roomLabel: "Table",
    listenUserEvents: true,
    useIdentity: () => ({
      user: overrides.user ?? null,
      authLoading: false,
      guestId: "g1",
      guestName: null,
      isGuest: overrides.isGuest ?? true,
    }),
    useScope: () => ({ restaurantId: 4, branchNumber: null }),
    toRoomPayload: ({ restaurantId, branchNumber }) => ({
      restaurantId: restaurantId.toString(),
      branchNumber: branchNumber?.toString() || "main",
    }),
  });
  let ctx!: SocketContextType;
  function Probe() {
    ctx = useSocketContext();
    return null;
  }
  render(
    <SocketProvider>
      <Probe />
    </SocketProvider>,
  );
  return () => ctx;
}

describe("createSocketProvider", () => {
  beforeEach(() => {
    fake.emit.mockClear();
    fake.disconnect.mockClear();
    fake.handlers = {};
    localStorage.clear();
  });

  it("conecta como invitado con clientType y nombre por defecto", async () => {
    setup();
    await act(async () => {});
    expect(fake.options).toMatchObject({
      auth: { clientType: "demo", guestId: "g1", guestName: "Invitado" },
    });
  });

  it("join/leave emiten con la sucursal por defecto una vez conectado", async () => {
    const ctx = setup();
    await act(async () => {});
    act(() => fake.handlers.connect());
    act(() => ctx().join("12"));
    expect(fake.emit).toHaveBeenCalledWith("join:table", {
      restaurantId: "4",
      branchNumber: "main",
      tableNumber: "12",
    });
    act(() => ctx().leave("12"));
    expect(fake.emit).toHaveBeenCalledWith("leave:table", {
      restaurantId: "4",
      branchNumber: "main",
      tableNumber: "12",
    });
  });

  it("al reconectar vuelve a la sala en la que estaba", async () => {
    setup();
    await act(async () => {});
    act(() => fake.handlers.connect());
    act(() => fake.handlers["table:joined"]({ roomName: "table:4:main:12" }));
    fake.emit.mockClear();
    act(() => fake.handlers.connect());
    expect(fake.emit).toHaveBeenCalledWith("join:table", {
      restaurantId: "4",
      branchNumber: "main",
      tableNumber: "12",
    });
  });

  it("usuario autenticado sin token cae al invitado", async () => {
    setup({ isGuest: false, user: { id: "u" } });
    await act(async () => {});
    expect(fake.options).toMatchObject({
      auth: { clientType: "demo", guestId: "g1" },
    });
  });
});
