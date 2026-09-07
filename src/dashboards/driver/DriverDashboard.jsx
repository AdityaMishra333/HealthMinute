import { useState, useEffect } from 'react';
import { signOut } from 'firebase/auth';
import { collection, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../../firebase';

function DriverDashboard() {
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'accidents'), (snapshot) => {
      setCases(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleAcceptCase = async (caseId) => {
    await updateDoc(doc(db, 'accidents', caseId), { status: 'accepted_by_driver' });
  };

  const handleNavigate = (latitude, longitude) => {
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`, '_blank');
  };

  const activeCount = cases.filter((c) => c.status === 'reported').length;

  return (
    <div className="page">
      <div className="topbar">
        <h1>HealthMinute — Driver dashboard</h1>
        <button className="btn btn-ghost" onClick={() => signOut(auth)}>
          Log out
        </button>
      </div>

      <div className="container">
        <div className="summary-bar">
          {activeCount} open case{activeCount !== 1 ? 's' : ''} of {cases.length} total
        </div>

        {loading ? (
          <p className="empty-state">Loading cases…</p>
        ) : cases.length === 0 ? (
          <p className="empty-state">No cases assigned right now.</p>
        ) : (
          cases.map((item) => (
            <div
              key={item.id}
              className={`alert-card ${item.status !== 'reported' ? 'resolved' : ''}`}
            >
              <p className="alert-title">Case #{item.id.slice(0, 8)}</p>
              <p className="alert-meta">
                Location: {item.latitude.toFixed(4)}, {item.longitude.toFixed(4)}
                <br />
                Reported by: {item.userEmail}
              </p>

              <div className="alert-actions">
                {item.status === 'reported' ? (
                  <>
                    <span className="tag tag-pending">Pending</span>
                    <button className="btn btn-success" onClick={() => handleAcceptCase(item.id)}>
                      Accept
                    </button>
                  </>
                ) : (
                  <span className="tag tag-resolved">Accepted</span>
                )}
                <button
                  className="btn btn-primary"
                  onClick={() => handleNavigate(item.latitude, item.longitude)}
                >
                  Navigate
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default DriverDashboard;
