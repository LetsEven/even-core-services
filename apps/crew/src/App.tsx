import { RouterProvider } from "react-router";
import { createAppRouter } from "./app/router";

// El estado de sesión vive en app/session/SessionProvider; las rutas, en app/router.
const router = createAppRouter();

export default function App() {
  return <RouterProvider router={router} />;
}
