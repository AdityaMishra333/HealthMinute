import { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import Login from './auth/Login';
import UserDashboard from './dashboards/user/UserDashboard';
import HospitalDashboard from './dashboards/hospital/HospitalDashboard';
import DriverDashboard from './dashboards/driver/DriverDashboard';
import TrackAccident from './tracking/TrackAccident';
import PwaPrompts from './shared/PwaPrompts';
import './App.css';

function App() {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        if (userDoc.exists()) {
          setRole(userDoc.data().role);
        }
      } else {
        setUser(null);
        setRole(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return <div className="page-loading">Loading…</div>;
  }

  return (
    <Router>
      <PwaPrompts />
      <Routes>
        <Route path="/track/:accidentId" element={<TrackAccident />} />
        {!user ? (
          <Route path="/*" element={<Login />} />
        ) : (
          <>
            {role === 'user' && <Route path="/*" element={<UserDashboard />} />}
            {role === 'hospital' && <Route path="/*" element={<HospitalDashboard />} />}
            {role === 'driver' && <Route path="/*" element={<DriverDashboard />} />}
            <Route path="/*" element={<Navigate to="/dashboard" />} />
          </>
        )}
      </Routes>
    </Router>
  );
}

export default App;
