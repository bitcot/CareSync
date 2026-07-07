import { Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { RoleGuard } from './auth/RoleGuard';
import { Login } from './pages/Login';
import { PatientPanel } from './pages/PatientPanel';
import { PatientDetail } from './pages/PatientDetail';
import { Population } from './pages/Population';
import { PopulationPatientList } from './pages/PopulationPatientList';
import { Governance } from './pages/Governance';
import { Quality } from './pages/Quality';
import { Team } from './pages/Team';
import { Sdoh } from './pages/Sdoh';
import { TaskQueue } from './pages/TaskQueue';
import { TaskDetail } from './pages/TaskDetail';
import { TaskManagement } from './pages/TaskManagement';
import { CarePlanBuilder } from './pages/CarePlanBuilder';
import { ComingSoon } from './pages/ComingSoon';
import { ShellScreenPage } from './pages/ShellScreenPage';
import { MoreScreens } from './pages/MoreScreens';

// S12 C.1 — `/task-center` now points at the real `TaskManagement` page
// (the W13 task-management center, ported from the lead project) rather
// than the S11 `ComingSoon` placeholder.

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <RoleGuard>
            <AppShell />
          </RoleGuard>
        }
      >
        <Route path="/panel" element={<PatientPanel />} />
        <Route path="/patients/:id" element={<PatientDetail />} />
        {/* S11 A1 — M05 SDOH resource directory + referral; every role with
            'sdoh' scope (director/coordinator/social_worker — see
            auth/scopes.ts) can reach it, so no extra RoleGuard here. */}
        <Route path="/patients/:id/sdoh" element={<Sdoh />} />
        <Route path="/tasks" element={<TaskQueue />} />
        <Route path="/tasks/:id" element={<TaskDetail />} />
        {/* S12 C.2 — Care Plan Builder (W14, capacity-flexed in S11 A4, now built). */}
        <Route
          path="/care-plans/:patientId"
          element={
            <RoleGuard role="coordinator">
              <CarePlanBuilder />
            </RoleGuard>
          }
        />
        <Route path="/task-center" element={<RoleGuard role="coordinator"><TaskManagement /></RoleGuard>} />
        <Route
          path="/population"
          element={
            <RoleGuard role="director">
              <Population />
            </RoleGuard>
          }
        />
        <Route
          path="/population/patients"
          element={
            <RoleGuard role="director">
              <PopulationPatientList />
            </RoleGuard>
          }
        />
        <Route
          path="/governance"
          element={
            <RoleGuard role="director">
              <Governance />
            </RoleGuard>
          }
        />
        <Route
          path="/quality"
          element={
            <RoleGuard role="director">
              <Quality />
            </RoleGuard>
          }
        />
        <Route
          path="/team"
          element={
            <RoleGuard role="director">
              <Team />
            </RoleGuard>
          }
        />
        <Route path="/coming-soon" element={<ComingSoon />} />
        {/* S11 B1 — one dynamic route for the 10 remaining GD9 shell screens
            (W13 has its own /task-center route above), not 11 static
            entries; see lib/shellScreens.ts. */}
        <Route path="/screens/:screenId" element={<ShellScreenPage />} />
        <Route path="/more" element={<MoreScreens />} />
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default App;
