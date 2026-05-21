import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { AuthProvider } from '@/contexts/AuthContext'
import { AssetProvider } from '@/contexts/AssetContext'
import { GenerationProvider } from '@/contexts/GenerationContext'
import { Layout } from '@/components/Layout'
import { Home } from '@/pages/Home'
import { Login } from '@/pages/Login'
import { CopyGenerator } from '@/pages/CopyGenerator'
import CroppingToolkit from '@/pages/CroppingToolkit'
import LifestyleGen from '@/pages/LifestyleGen'
import Gallery from '@/pages/Gallery'

const queryClient = new QueryClient()

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AssetProvider>
          <GenerationProvider>
            <BrowserRouter>
              <Routes>
                <Route element={<Layout />}>
                  <Route index element={<Home />} />
                  <Route path="login" element={<Login />} />
                  <Route path="copy-generator" element={<CopyGenerator />} />
                  <Route path="toolkit" element={<CroppingToolkit />} />
                  <Route path="lifestyle" element={<LifestyleGen />} />
                  <Route path="gallery" element={<Gallery />} />
                </Route>
              </Routes>
            </BrowserRouter>
          </GenerationProvider>
        </AssetProvider>
      </AuthProvider>
      <Toaster richColors position="top-right" />
    </QueryClientProvider>
  )
}

export default App
