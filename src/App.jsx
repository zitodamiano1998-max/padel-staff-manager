import { Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Staff from './pages/Staff'
import Planning from './pages/Planning'
import Availability from './pages/Availability'
import Clock from './pages/Clock'
import Timesheets from './pages/Timesheets'
import Leaves from './pages/Leaves'
import Swaps from './pages/Swaps'
import AcceptInvite from './pages/AcceptInvite'

function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<Login />} />
      <Route path="/accept-invite" element={<AcceptInvite />} />

      {/* Protetto: tutti gli utenti loggati */}
      <Route path="/dashboard" element={
        <ProtectedRoute>
          <Layout><Dashboard /></Layout>
        </ProtectedRoute>
      } />

      <Route path="/clock" element={
        <ProtectedRoute>
          <Layout><Clock /></Layout>
        </ProtectedRoute>
      } />

      <Route path="/planning" element={
        <ProtectedRoute>
          <Layout><Planning /></Layout>
        </ProtectedRoute>
      } />

      <Route path="/availability" element={
        <ProtectedRoute>
          <Layout><Availability /></Layout>
        </ProtectedRoute>
      } />

      <Route path="/leaves" element={
        <ProtectedRoute>
          <Layout><Leaves /></Layout>
        </ProtectedRoute>
      } />

      <Route path="/swaps" element={
        <ProtectedRoute>
          <Layout><Swaps /></Layout>
        </ProtectedRoute>
      } />

      {/* Manager only */}
      <Route path="/staff" element={
        <ProtectedRoute requireManager>
          <Layout><Staff /></Layout>
        </ProtectedRoute>
      } />

      <Route path="/timesheets" element={
        <ProtectedRoute requireManager>
          <Layout><Timesheets /></Layout>
        </ProtectedRoute>
      } />

      {/* Default */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

export default App
