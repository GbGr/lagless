import './title.screen.scss';
import { FC, useEffect } from 'react';
import { Balance } from '../components/balance/balance';
import { CharacterPreview } from '../components/character-preview/character-preview';
import { UsernameInput } from '../components/username-input/username-input';
import { Button } from '../components/button/button';
import { useNavigate } from 'react-router-dom';
import { usePlayer, DevBridge } from '@lagless/react';
import { SumoPlayerData } from '@lagless/circle-sumo-simulation';
import LockerSvg from '../../assets/svg/locker.svg?react';
import { useStartMatch } from '../hooks/use-start-match';
import { useStartMultiplayerMatch } from '../hooks/use-start-multiplayer-match';
import { Dots } from '../components/dots';

export const TitleScreen: FC = () => {
  const navigate = useNavigate();
  const player = usePlayer();
  const data = player.data as SumoPlayerData;
  const { isBusy, startMatch } = useStartMatch();
  const multiplayer = useStartMultiplayerMatch();

  const isMultiplayerBusy = multiplayer.state !== 'idle';

  // Dev-bridge: auto-match on URL param or parent command
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('autoMatch') === 'true' && multiplayer.state === 'idle') {
      multiplayer.startMatch();
    }
    const bridge = DevBridge.fromUrlParams();
    if (!bridge) return;
    bridge.sendMatchState(multiplayer.state === 'idle' ? 'idle' : multiplayer.state);
    return bridge.onParentMessage((msg) => {
      if (msg.type === 'dev-bridge:start-match' && multiplayer.state === 'idle') {
        multiplayer.startMatch();
      }
    });
  }, [multiplayer.state]);

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
        <Button mode="primary" size="large" onClick={startMatch} disabled={isMultiplayerBusy}>
          {isBusy ? <small>Connecting <Dots /></small> : 'Play Local'}
        </Button>
        <Button
          mode="primary"
          size="large"
          onClick={isMultiplayerBusy ? multiplayer.cancel : multiplayer.startMatch}
          disabled={isBusy}
        >
          {multiplayer.state === 'queuing' && (
            <small>
              In Queue{multiplayer.queuePosition ? ` #${multiplayer.queuePosition}` : ''} <Dots />
            </small>
          )}
          {multiplayer.state === 'connecting' && <small>Connecting <Dots /></small>}
          {multiplayer.state === 'error' && <small>Error: {multiplayer.error}</small>}
          {multiplayer.state === 'idle' && 'Play Online'}
        </Button>
      </div>
    </div>
  );
};
