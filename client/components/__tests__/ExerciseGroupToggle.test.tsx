import { fireEvent, render, screen } from '@testing-library/react-native';

import { ExerciseGroupToggle } from '@components/ExerciseGroupToggle';
// Imported for its side effect so t() returns real strings and the assertions below
// read as the English the user sees.
import '../../src/i18n';

describe('ExerciseGroupToggle', () => {
  it('names the group and how many exercises it holds', () => {
    render(<ExerciseGroupToggle count={9} expanded={false} onPress={jest.fn()} />);
    expect(screen.getByText('Exercises')).toBeTruthy();
    expect(screen.getByText('9 exercises')).toBeTruthy();
  });

  it('uses the singular for one exercise', () => {
    render(<ExerciseGroupToggle count={1} expanded={false} onPress={jest.fn()} />);
    expect(screen.getByText('1 exercise')).toBeTruthy();
  });

  it('toggles on a tap', () => {
    const onPress = jest.fn();
    render(<ExerciseGroupToggle count={3} expanded={false} onPress={onPress} />);

    fireEvent.press(screen.getByRole('button'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  // Routine selection mode disables it: exercises cannot be selected, and nothing should
  // shift under the user's finger while they pick routines to remove.
  it('ignores taps while disabled', () => {
    const onPress = jest.fn();
    render(<ExerciseGroupToggle count={3} expanded={false} disabled onPress={onPress} />);

    fireEvent.press(screen.getByRole('button'));

    expect(onPress).not.toHaveBeenCalled();
  });

  it('reports whether it is expanded', () => {
    const { rerender } = render(
      <ExerciseGroupToggle count={3} expanded={false} onPress={jest.fn()} />,
    );
    expect(screen.getByRole('button').props.accessibilityState).toMatchObject({
      expanded: false,
    });

    rerender(<ExerciseGroupToggle count={3} expanded onPress={jest.fn()} />);
    expect(screen.getByRole('button').props.accessibilityState).toMatchObject({ expanded: true });
  });
});
