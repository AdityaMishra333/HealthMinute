import { useState, useRef } from 'react';
import { signOut } from 'firebase/auth';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../../firebase';

function UserDashboard() {
  const [location, setLocation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleGetLocation = () => {
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setLocation({ latitude, longitude });
        setError('');
        setLoading(false);
      },
      (err) => {
        setError('Failed to get location: ' + err.message);
        setLoading(false);
      }
    );
  };

  const handleReportAccident = async () => {
    if (!location) {
      setError('Please capture location first');
      return;
    }

    setLoading(true);
    try {
      await addDoc(collection(db, 'accidents'), {
        userId: auth.currentUser.uid,
        userEmail: auth.currentUser.email,
        latitude: location.latitude,
        longitude: location.longitude,
        status: 'reported',
        createdAt: serverTimestamp(),
      });

      setSuccess('Accident reported successfully!');
      setLocation(null);
      setError('');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError('Error reporting accident: ' + err.message);
    }
    setLoading(false);
  };

  return (
    <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2>User Dashboard - Report Accident</h2>
        <button onClick={() => signOut(auth)} style={{ padding: '8px 16px', cursor: 'pointer' }}>
          Logout
        </button>
      </div>

      <div style={{ border: '1px solid #ccc', padding: '20px', borderRadius: '8px' }}>
        <h3>Phase 1 - Report Accident</h3>

        <div style={{ marginBottom: '20px' }}>
          <button
            onClick={handleGetLocation}
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px',
              backgroundColor: '#3498db',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            {loading && location === null ? 'Getting Location...' : '📍 Capture Location'}
          </button>
          {location && (
            <p style={{ marginTop: '10px', color: 'green' }}>
              ✓ Location captured: {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
            </p>
          )}
        </div>

        <button
          onClick={handleReportAccident}
          disabled={loading || !location}
          style={{
            width: '100%',
            padding: '12px',
            backgroundColor: location ? '#e74c3c' : '#bdc3c7',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: location ? 'pointer' : 'not-allowed',
            fontSize: '16px',
            fontWeight: 'bold',
          }}
        >
          {loading ? 'Submitting...' : '🚨 Submit Accident Report'}
        </button>

        {error && <p style={{ color: 'red', marginTop: '10px' }}>{error}</p>}
        {success && <p style={{ color: 'green', marginTop: '10px' }}>{success}</p>}
      </div>
    </div>
  );
}

export default UserDashboard;
