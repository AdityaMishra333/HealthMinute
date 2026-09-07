import { useState } from 'react';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import './Login.css';

function Login() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('user');
  const [error, setError] = useState('');

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [age, setAge] = useState('');
  const [bloodGroup, setBloodGroup] = useState('O+');
  const [allergies, setAllergies] = useState('');
  const [medicalConditions, setMedicalConditions] = useState('');
  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('');

  const handleAuth = async (e) => {
    e.preventDefault();
    setError('');

    try {
      if (isSignUp) {
        const result = await createUserWithEmailAndPassword(auth, email, password);

        const profileData = {
          email,
          role,
          createdAt: new Date(),
        };

        if (role === 'user') {
          Object.assign(profileData, {
            fullName,
            phone,
            age: age ? Number(age) : null,
            bloodGroup,
            allergies,
            medicalConditions,
            emergencyContactName,
            emergencyContactPhone,
          });
        }

        await setDoc(doc(db, 'users', result.user.uid), profileData);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-box">
        <h1>HealthMinute</h1>
        <p className="auth-subtitle">Emergency response, coordinated in real time.</p>

        <form onSubmit={handleAuth}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          {isSignUp && (
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="user">User</option>
              <option value="hospital">Hospital</option>
              <option value="driver">Ambulance Driver</option>
            </select>
          )}

          {isSignUp && role === 'user' && (
            <>
              <div className="form-divider">Personal details</div>

              <input
                type="text"
                placeholder="Full name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
              <input
                type="tel"
                placeholder="Phone number"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
              <input
                type="number"
                placeholder="Age"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                min="0"
                max="120"
              />

              <div className="form-divider">Medical details</div>

              <select value={bloodGroup} onChange={(e) => setBloodGroup(e.target.value)}>
                <option value="O+">O+</option>
                <option value="O-">O-</option>
                <option value="A+">A+</option>
                <option value="A-">A-</option>
                <option value="B+">B+</option>
                <option value="B-">B-</option>
                <option value="AB+">AB+</option>
                <option value="AB-">AB-</option>
              </select>
              <input
                type="text"
                placeholder="Allergies (if any)"
                value={allergies}
                onChange={(e) => setAllergies(e.target.value)}
              />
              <textarea
                placeholder="Existing medical conditions (if any)"
                value={medicalConditions}
                onChange={(e) => setMedicalConditions(e.target.value)}
                rows={2}
              />

              <div className="form-divider">Emergency contact</div>

              <input
                type="text"
                placeholder="Contact name"
                value={emergencyContactName}
                onChange={(e) => setEmergencyContactName(e.target.value)}
                required
              />
              <input
                type="tel"
                placeholder="Contact phone number"
                value={emergencyContactPhone}
                onChange={(e) => setEmergencyContactPhone(e.target.value)}
                required
              />
            </>
          )}

          <button type="submit" className="btn btn-primary">
            {isSignUp ? 'Create account' : 'Log in'}
          </button>
        </form>

        <div className="auth-switch">
          {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button type="button" onClick={() => setIsSignUp(!isSignUp)}>
            {isSignUp ? 'Log in' : 'Sign up'}
          </button>
        </div>

        {error && <p className="auth-error">{error}</p>}
      </div>
    </div>
  );
}

export default Login;
