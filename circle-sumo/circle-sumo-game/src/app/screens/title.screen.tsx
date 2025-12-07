import './title.screen.scss';
import { FC } from 'react';
import { Balance } from '../components/balance/balance';
import { CharacterPreview } from '../components/character-preview/character-preview';
import { UsernameInput } from '../components/username-input/username-input';
import { Button } from '../components/button/button';
import { useNavigate } from 'react-router-dom';
import { usePlayer } from '@lagless/react';
import { SumoPlayerData } from '@lagless/circle-sumo-simulation';
import LockerSvg from '../../assets/svg/locker.svg?react';
import { useStartMatch } from '../hooks/use-start-match';
import { Dots } from '../components/dots';

export const TitleScreen: FC = () => {
  const navigate = useNavigate();
  const player = usePlayer();
  const data = player.data as SumoPlayerData;
  const { isBusy, startMatch } = useStartMatch();

  return (
    <div className="screen title-screen">
      <div className="title-screen__title">
        Circle Sumo
      </div>
      <Balance />
      <div className="title-screen__character">
        <LockerSvg className="title-screen__locker" onClick={() => navigate('/locker')} />
        <CharacterPreview skinId={data.selectedSkinId || 0} />
      </div>
      <UsernameInput />
      <div className="title-screen__actions">
        <Button mode="secondary" size="medium" onClick={() => navigate('/roulette')}>
          Get Skins
        </Button>
        <Button mode="primary" size="large" onClick={startMatch}>
          {isBusy ? <small>Connecting <Dots /></small> : 'Play'}
        </Button>
      </div>
    </div>
  );
};
