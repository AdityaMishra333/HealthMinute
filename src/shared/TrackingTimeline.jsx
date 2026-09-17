import './TrackingTimeline.css';

function TrackingTimeline({ steps }) {
  return (
    <div className="dt-timeline">
      {steps.map((step, i) => {
        const state = step.done ? 'done' : step.active ? 'active' : 'pending';
        return (
          <div
            className={`dt-timeline-row dt-timeline-row-${state} dt-timeline-row-tone-${step.tone}`}
            key={step.key}
          >
            <div className="dt-timeline-rail">
              <span className="dt-timeline-dot" />
              {i < steps.length - 1 && <span className="dt-timeline-line" />}
            </div>
            <p className="dt-timeline-label">{step.label}</p>
            <p className="dt-timeline-time">{step.time ?? (state === 'active' ? 'In progress' : '')}</p>
          </div>
        );
      })}
    </div>
  );
}

export default TrackingTimeline;
