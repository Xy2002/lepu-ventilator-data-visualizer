import type { EventRecord } from '../types';

interface EventTableProps {
  events: EventRecord[];
  onSelectEvent: (seconds: number) => void;
}

export function EventTable({ events, onSelectEvent }: EventTableProps) {
  return (
    <section className="event-table">
      <h3>事件</h3>
      {events.length === 0 ? <p>当前日期没有事件记录。</p> : null}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>类型</th>
              <th>时间</th>
              <th>值 1</th>
              <th>值 2</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event, index) => (
              <tr key={`${event.sourceLabel}-${event.timestamp}-${index}`}>
                <td>
                  <button
                    type="button"
                    onClick={() => {
                      if (typeof event.secondsFromDayStart === 'number') {
                        onSelectEvent(event.secondsFromDayStart);
                      }
                    }}
                  >
                    {event.sourceLabel}
                  </button>
                </td>
                <td>{event.timestamp ?? '-'}</td>
                <td>{event.value1}</td>
                <td>{event.value2}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
