import { useState, useEffect } from 'react';
import { signOut } from 'firebase/auth';
import { collection, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../../firebase';

function HospitalDashboard() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'accidents'), (snapshot) => {
      setAlerts(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleAcceptAlert = async (alertId) => {
    await updateDoc(doc(db, 'accidents', alertId), { status: 'accepted_by_hospital' });
  };

  const pendingCount = alerts.filter((a) => a.status === 'reported').length;

  return (
    <div className="page">
      <div className="topbar">
        <h1>HealthMinute — Hospital dashboard</h1>
        <button className="btn btn-ghost" onClick={() => signOut(auth)}>
          Log out
        </button>
      </div>

      <div className="container">
        <div className="summary-bar">
          {pendingCount} pending alert{pendingCount !== 1 ? 's' : ''} of {alerts.length} total
        </div>

        {loading ? (
          <p className="empty-state">Loading alerts…</p>
        ) : alerts.length === 0 ? (
          <p className="empty-state">No accident alerts right now.</p>
        ) : (
          alerts.map((alert) => (
            <div
              key={alert.id}
              className={`alert-card ${alert.status !== 'reported' ? 'resolved' : ''}`}
            >
              <p className="alert-title">Accident alert</p>
              <p className="alert-meta">
                Location: {alert.latitude.toFixed(4)}, {alert.longitude.toFixed(4)}
                <br />
                Reported by: {alert.userEmail}
              </p>

              {alert.status === 'reported' ? (
                <div className="alert-actions">
                  <span className="tag tag-pending">Pending</span>
                  <button className="btn btn-success" onClick={() => handleAcceptAlert(alert.id)}>
                    Accept
                  </button>
                </div>
              ) : (
                <span className="tag tag-resolved">Accepted</span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default HospitalDashboard;
