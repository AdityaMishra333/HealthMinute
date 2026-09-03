import { useState, useEffect } from 'react';
import { signOut } from 'firebase/auth';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../../firebase';

function HospitalDashboard() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'accidents'), where('status', '==', 'reported'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const accidentAlerts = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setAlerts(accidentAlerts);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleAcceptAlert = async (alertId) => {
    console.log('Alert accepted:', alertId);
  };

  return (
    <div style={{ padding: '20px', maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2>Hospital Dashboard - Incoming Alerts</h2>
        <button onClick={() => signOut(auth)} style={{ padding: '8px 16px', cursor: 'pointer' }}>
          Logout
        </button>
      </div>

      <div style={{ marginBottom: '20px', padding: '10px', backgroundColor: '#ecf0f1', borderRadius: '4px' }}>
        <h3>Total Active Alerts: {alerts.length}</h3>
      </div>

      {loading ? (
        <p>Loading alerts...</p>
      ) : alerts.length === 0 ? (
        <p style={{ color: '#7f8c8d' }}>No active accident alerts at the moment.</p>
      ) : (
        <div>
          {alerts.map(alert => (
            <div key={alert.id} style={{
              border: '2px solid #e74c3c',
              padding: '15px',
              marginBottom: '15px',
              borderRadius: '8px',
              backgroundColor: '#fadbd8'
            }}>
              <div style={{ display: 'flex', gap: '20px' }}>
                <div style={{ flex: 1 }}>
                  <h4 style={{ margin: '0 0 10px 0', color: '#c0392b' }}>🚨 Accident Alert</h4>
                  <p><strong>Location:</strong> {alert.latitude.toFixed(4)}, {alert.longitude.toFixed(4)}</p>
                  <p><strong>Reported By:</strong> {alert.userEmail}</p>
                  <p><strong>Time:</strong> {alert.createdAt ? new Date(alert.createdAt.toDate()).toLocaleTimeString() : 'N/A'}</p>
                  <button 
                    onClick={() => handleAcceptAlert(alert.id)}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: '#27ae60',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      marginTop: '10px'
                    }}
                  >
                    ✓ Accept Alert
                  </button>
                </div>
                
                {alert.photoURL && (
                  <div>
                    <img 
                      src={alert.photoURL} 
                      alt="Accident" 
                      style={{
                        maxWidth: '200px',
                        maxHeight: '200px',
                        borderRadius: '4px',
                        objectFit: 'cover'
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default HospitalDashboard;
