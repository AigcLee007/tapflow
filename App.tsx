import { AppRouter } from "./src/app/AppRouter";
import { AuthProvider } from "./src/auth/AuthProvider";

export default function App() {
  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  );
}
