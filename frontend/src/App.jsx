import { Navigate, Route, Routes} from "react-router-dom";
import ChatPage from './pages/ChatPage';
import LoginPage from './pages/LoginPage';
import SignUpPage from './pages/SignUpPage';
import { useAuthStore } from "./store/useAuthStore";
import { useEffect } from "react";
import PageLoader from "./components/PageLoader";
import { Toaster } from "react-hot-toast";



function App() {
  const { checkAuth, connectSocket, disconnectSocket, isCheckingAuth, authUser } = useAuthStore();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (authUser) {
      connectSocket();
      return;
    }
    disconnectSocket();
  }, [authUser, connectSocket, disconnectSocket]);

  

  if(isCheckingAuth) return <PageLoader />;

  
  


    return (
      <div className="app-shell min-h-screen relative flex items-center justify-center p-4 overflow-hidden">

        <div className="theme-grid absolute inset-0" />
        <div className="absolute top-0 -left-4 size-96 theme-glow" data-position="top" />
        <div className="absolute bottom-0 -right-4 size-96 theme-glow" data-position="bottom" />


   <Routes>
    <Route path='/' element={authUser ? <ChatPage /> : <Navigate to={"/login"} />} />
    <Route path='/login' element={!authUser ? <LoginPage /> : <Navigate to={"/"} />} />
    <Route path='/signup' element={!authUser ? <SignUpPage /> : <Navigate to={"/"} />} />
    </Routes>

    <Toaster/>

    
    </div>
  

  );
}

export default App;