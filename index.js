const crypto = require('crypto');
const querystring = require('querystring');
const sshpk = require('sshpk');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');
const { findPrivateKey } = require('probot/lib/private-key');

const privateKey = sshpk.parsePrivateKey(findPrivateKey(), 'pem');

function createCallbackToken(appInstallationId, deployment, sha, subdomain) {
  const payload = JSON.stringify({
    appInstallationId,
    deployment,
    sha,
    subdomain,
  });
  const sign = privateKey.createSign('sha256');
  sign.update(payload);
  const signature = sign.sign();
  return `${payload}--${signature.toBuffer().toString('hex')}`;
}

function verifyCallbackToken(token) {
  const [payload, hexSignature] = token.split('--');
  const signature = sshpk.parseSignature(Buffer.from(hexSignature, 'hex'), 'rsa', 'asn1');
  const verify = privateKey.createVerify('sha256');
  verify.update(payload);
  const valid = verify.verify(signature);
  return valid ? JSON.parse(payload) : null;
}

module.exports = (robot) => {
  const app = robot.route('/deployment_listener');

  app.use(bodyParser.json());

  app.get('/ping', (req, res) => {
    res.end('pong');
  });

  app.post('/update_deployment_status', async (req, res) => {
    const tokenPayload = verifyCallbackToken(req.query.token);
    if (!tokenPayload) {
      robot.log('Received invalid token');
      res.status(401).send('Invalid token');
      return;
    }
    const { appInstallationId, deployment, subdomain } = tokenPayload;
    const { deploymentStatus, logsPort } = req.body;
    // TODO: use https://github.com/getsentry/probot-config and get these from in-repo config
    const deploymentLogURL = `http://whosecase.com:${logsPort}`;
    const scheme = 'http';
    const host = 'whosecase.com';
    const path = 'home/trial_signup';

    const { deploymentEnvironmentURL, description } =
      deploymentStatus === 'success' ?
        { deploymentEnvironmentURL: `${scheme}://${subdomain}.${host}/${path}`,
          description: `Review App Deployer successfully deployed ${subdomain}` } :
        { deploymentEnvironmentURL: null,
          description: `Review App Deployer received request to deploy ${subdomain}` };

    const octokit = await robot.auth(appInstallationId);

    const createDeploymentStatusPayload = {
      owner: deployment.owner,
      repo: deployment.repo,
      id: deployment.id,
      state: deploymentStatus,
      description: description,
      log_url: deploymentLogURL,
      environment_url: deploymentEnvironmentURL,
      auto_inactive: true,
      headers: {
        accept: 'application/vnd.github.ant-man-preview+json'
      }
    };

    const result = await octokit.repos.createDeploymentStatus(createDeploymentStatusPayload);

    res.json(result.data);
  });

  robot.on(
    'deployment',
    async context => {
      const octokit = context.github;
      const payload = context.payload;

    // TODO: use https://github.com/getsentry/probot-config and get this from in-repo config
    const createReviewAppURL = 'http://localhost:3000/shard';

      const callbackToken = createCallbackToken(
        payload.installation.id,
        {
          owner: payload.repository.owner.login,
          repo: payload.repository.name,
          id: payload.deployment.id
        },
        payload.deployment.sha,
        payload.deployment.environment
      );

      const callbackPath = '/deployment_listener/update_deployment_status';
      const callbackQueryString = querystring.stringify({ token: callbackToken });
      const callbackUrl = `${process.env.PROBOT_INSTANCE_URL}${callbackPath}?${callbackQueryString}`;

      const createReviewAppPayload = {
        callbackUrl,
        task: payload.deployment.task,
        sha: payload.deployment.sha,
        subdomain: payload.deployment.environment
      }

      robot.log("The request we'll make to the deployer:");
      robot.log(
        `
      fetch(
        '${createReviewAppURL}',
        {
          method: 'POST',
          body: JSON.stringify(${JSON.stringify(createReviewAppPayload)}),
          headers: {
            'Content-Type': 'application/json'
          }
        }
      )
        `
      );
      fetch(
        createReviewAppURL,
        {
          method: 'POST',
          body: JSON.stringify(createReviewAppPayload),
          headers: {
            'Content-Type': 'application/json'
          }
        }
      )

      robot.log('Example callback request:');
      robot.log(
        `
        fetch(
          '${callbackUrl}',
          {
            method: 'POST',
            body: JSON.stringify({
              deploymentStatus: 'pending',
              logsPort: 327701,
            }),
            headers: {
              'Content-Type': 'application/json'
            }
          }
        )
        `
      );
    }
  )
};
