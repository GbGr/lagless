import styled from '@emotion/styled';
import { CrazyBallsGame } from './game/crazy-balls-game';

const StyledApp = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
`;

export function App() {
  return (
    <StyledApp>
      <CrazyBallsGame />
    </StyledApp>
  );
}

export default App;
