// Adapted from bball repo (src/App.tsx). Routes mirror bball except for
// out-of-scope pages (Editor, Notebook, Projects, GroupShot, 3D, etc.).
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { AuthProvider } from '@/contexts/AuthContext'
import { AssetProvider } from '@/contexts/AssetContext'
import { GenerationProvider } from '@/contexts/GenerationContext'
import Layout from '@/components/Layout'
import ProtectedRoute from '@/components/ProtectedRoute'
import Index from '@/pages/Index'
import { Login } from '@/pages/Login'
import Dashboard from '@/pages/Dashboard'
import ImageCreation from '@/pages/ImageCreation'
import LifestyleGen from '@/pages/LifestyleGen'
import Gallery from '@/pages/Gallery'
import { CopyGenerator } from '@/pages/CopyGenerator'
import CroppingToolkit from '@/pages/CroppingToolkit'
import Notebook from '@/pages/Notebook'

const queryClient = new QueryClient()

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AssetProvider>
          <GenerationProvider>
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/login" element={<Login />} />
                <Route path="/" element={<Layout />}>
                  <Route path="dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                  <Route path="image-creation" element={<ProtectedRoute><ImageCreation /></ProtectedRoute>} />
                  <Route path="image-creation/lifestyle" element={<ProtectedRoute><LifestyleGen /></ProtectedRoute>} />
                  <Route path="gallery" element={<ProtectedRoute><Gallery /></ProtectedRoute>} />
                  <Route path="copy-generator" element={<ProtectedRoute><CopyGenerator /></ProtectedRoute>} />
                  <Route path="notebook" element={<ProtectedRoute><Notebook /></ProtectedRoute>} />
                  <Route path="toolkit" element={<ProtectedRoute><CroppingToolkit /></ProtectedRoute>} />
                </Route>
              </Routes>
            </BrowserRouter>
          </GenerationProvider>
        </AssetProvider>
      </AuthProvider>
      <Toaster richColors position="top-center" />
    </QueryClientProvider>
  )
}

export default App
