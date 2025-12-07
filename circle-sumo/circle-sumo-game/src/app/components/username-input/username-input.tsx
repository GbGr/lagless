import './username-input.scss';
import { FC, useCallback, FormEvent, useState } from 'react';
import EditSvg from '../../../assets/svg/edit.svg?react';
import { usePlayer } from '@lagless/react';

export const UsernameInput: FC = () => {
  const player = usePlayer();
  const [ usernameDraft, setUsernameDraft ] = useState(player.username);

  const handleSubmit = useCallback((e: FormEvent) => {
    e.preventDefault();
  }, []);

  return (
    <form onSubmit={handleSubmit}>
      <label className="username-input">
        <input
          required
          type="text"
          maxLength={32}
          value={usernameDraft}
          className="username-input__field"
          placeholder="Enter your username"
          onChange={(e) => setUsernameDraft(e.target.value.trim())}
        />
        <EditSvg className="username-input__icon" />
      </label>
    </form>
  );
};
