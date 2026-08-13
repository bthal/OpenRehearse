import { render, screen } from '@testing-library/react-native';

import '../../src/i18n';
import { SectionLabel } from '../SectionLabel';

const COLOR = '#0B65DA';

type Props = React.ComponentProps<typeof SectionLabel>;

function renderLabel(props: Partial<Props> = {}) {
  const base: Props = {
    name: 'Refrain',
    previousName: 'Intro',
    nextName: 'Strophe 1',
    color: COLOR,
    previousColor: COLOR,
    nextColor: COLOR,
    sectionIndex: 1,
    collapsed: false,
    canNavigate: true,
    onSeek: () => {},
  };
  return render(<SectionLabel {...base} {...props} />);
}

describe('SectionLabel', () => {
  it('shows the section name', () => {
    renderLabel();
    expect(screen.getByText('Refrain')).toBeTruthy();
  });

  it('keeps both neighbours mounted, ready to be swiped in', () => {
    // They live a full label-width out to each side, clipped until a drag pulls one
    // in. Mounting them on demand would mean the first frame of every swipe is blank.
    renderLabel();
    expect(screen.getByText('Intro')).toBeTruthy();
    expect(screen.getByText('Strophe 1')).toBeTruthy();
  });

  it('renders no neighbour cell at the ends of the piece', () => {
    renderLabel({ previousName: null, nextName: null });
    expect(screen.getByText('Refrain')).toBeTruthy();
    expect(screen.queryByText('Intro')).toBeNull();
    expect(screen.queryByText('Strophe 1')).toBeNull();
  });

  it('keeps the row mounted while collapsed', () => {
    // Collapsed hides the contents by animating opacity to 0, not by unmounting them:
    // the strip has to roll straight back down into the label it came from.
    renderLabel({ collapsed: true });
    expect(screen.getByText('Refrain')).toBeTruthy();
  });

  it('exposes section navigation as an accessibility action', () => {
    // The swipe is the only pointer affordance, so it needs a non-gestural equivalent.
    const seeks: number[] = [];
    renderLabel({ onSeek: (d) => seeks.push(d) });
    const label = screen.getByRole('adjustable');
    label.props.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } });
    label.props.onAccessibilityAction({ nativeEvent: { actionName: 'decrement' } });
    expect(seeks).toEqual([1, -1]);
  });

  it('ignores navigation actions while navigation is unavailable', () => {
    // How the screen suppresses seeking while playing or while a loop is armed.
    const seeks: number[] = [];
    renderLabel({ canNavigate: false, onSeek: (d) => seeks.push(d) });
    const label = screen.getByRole('adjustable');
    label.props.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } });
    expect(seeks).toEqual([]);
  });
});
