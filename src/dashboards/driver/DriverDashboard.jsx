import { useState, useEffect } from 'react';
import { signOut } from 'firebase/auth';
import { collection, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../../firebase';

function DriverDashboard() {
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'accidents'), (snapshot) => {
      const accidentCases = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setCases(accidentCases);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleAcceptCase = async (caseId) => {
    try {
      await updateDoc(doc(db, 'accidents', caseId), {
        status: 'accepted_by_driver'
      });
      alert('Case accepted!');
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  const handleStartNavigation = (latitude, longitude) => {
    const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
    window.open(googleMapsUrl, '_blank');
  };

  return (
    <div style={{ padding: '20px', maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2>Ambulance Driver Dashboard</h2>
        <button onClick={() => signOut(auth)} style={{ padding: '8px 16px', cursor: 'pointer' }}>
          Logout
        </button>
      </div>

      <div style={{ marginBottom: '20px', padding: '10px', backgroundColor: '#ecf0f1', borderRadius: '4px' }}>
        <h3>Available Cases: {cases.length}</h3>
      </div>

      {loading ? (
        <p>Loading cases...</p>
      ) : cases.length === 0 ? (
        <p style={{ color: '#7f8c8d' }}>No active cases available.</p>
      ) : (
        <div>
          {cases.map(caseItem => (
            <div key={caseItem.id} style={{
              border: '2px solid #3498db',
              padding: '15px',
              marginBottom: '15px',
              borderRadius: '8px',
              backgroundColor: caseItem.status === 'reported' ? '#ebf5fb' : '#d5f4e6'
            }}>
              <div style={{ display: 'flex', gap: '20px' }}>
                <div style={{ flex: 1 }}>
                  <h4 style={{ margin: '0 0 10px 0', color: '#2c3e50' }}>📍 Case #{caseItem.id.slice(0, 8)}</h4>
                  <p><strong>Location:</strong> {caseItem.latitude.toFixed(4)}, {caseItem.longitude.toFixed(4)}</p>
                  <p><strong>Reported By:</strong> {caseItem.userEmail}</p>
                  <p><strong>Status:</strong> {caseItem.status}</p>
                  
                  <div style={{ marginTop: '10px', display: 'flex', gap: '10px' }}>
                    {caseItem.status === 'reported' && (
                      <>
                        <button 
                          onClick={() => handleAcceptCase(caseItem.id)}
                          style={{
                            padding: '8px 16px',
                            backgroundColor: '#27ae60',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer'
                          }}
                        >
                          ✓ Accept Case
                        </button>
                        
                        <button 
                          onClick={() => handleStartNavigation(caseItem.latitude, caseItem.longitude)}
                          style={{
                            padding: '8px 16px',
                            backgroundColor: '#e74c3c',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer'
                          }}
                        >
                          🗺️ Navigate
                        </button>
                      </>
                    )}
                    {caseItem.status === 'accepted_by_driver' && (
                      <>
                        <p style={{ color: 'green', fontWeight: 'bold' }}>✓ Accepted</p>
                        <button 
                          onClick={() => handleStartNavigation(caseItem.latitude, caseItem.longitude)}
                          style={{
                            padding: '8px 16px',
                            backgroundColor: '#e74c3c',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer'
                          }}
                        >
                          🗺️ Navigate
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default DriverDashboard;
