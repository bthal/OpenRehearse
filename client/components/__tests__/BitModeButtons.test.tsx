import { fireEvent, render, screen } from '@testing-library/react-native';

import { BitModeButtons } from '@components/BitModeButtons';
// Imported for its side effect so t() returns real strings and the assertions below
// read as the English the user sees.
import '../../src/i18n';

describe('BitModeButtons', () => {
  it('offers leaving the bit', () => {
    render(<BitModeButtons onLeave={jest.fn()} />);
    expect(screen.getByLabelText('Leave bit')).toBeTruthy();
  });

  it('leaves the bit on a tap', () => {
    const onLeave = jest.fn();
    render(<BitModeButtons onLeave={onLeave} />);

    fireEvent.press(screen.getByLabelText('Leave bit'));

    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  // There is deliberately no Back button in bit mode: leaving the bit is the way out,
  // rather than a control that abandons it silently on the way to the Dashboard.
  it('does not offer Back', () => {
    render(<BitModeButtons onLeave={jest.fn()} />);
    expect(screen.queryByLabelText('Back')).toBeNull();
  });

  // Deleting moved to a long press on the marker: a toolbar button could only ever reach
  // the armed bit, while the strip shows every one of them.
  it('does not offer Delete', () => {
    render(<BitModeButtons onLeave={jest.fn()} />);
    expect(screen.queryByLabelText('Delete bit')).toBeNull();
  });
});
