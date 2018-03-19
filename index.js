const bodyParser = require('body-parser');
const fetch = require('node-fetch');

module.exports = (robot) => {
  const app = robot.route('/deployment_listener');

  app.use(bodyParser.json());

  app.get('/ping', (req, res) => {
    res.end('pong');
  });

  app.post('/update_deployment_status', async (req, res) => {
    const { appInstallationId, deployment, deploymentStatus, logsPort, subdomain } = req.body;

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

      const createReviewAppPayload = {
        appInstallationId: payload.installation.id,
        callbackUrl: `${process.env.PROBOT_INSTANCE_URL}/deployment_listener/update_deployment_status`,
        deployment: {
          owner: payload.repository.owner.login,
          repo: payload.repository.name,
          task: payload.deployment.task,
          id: payload.deployment.id
        },
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
          '${process.env.PROBOT_INSTANCE_URL}/deployment_listener/update_deployment_status',
          {
            method: 'POST',
            body: JSON.stringify({
              appInstallationId: ${payload.installation.id},
              deployment: ${JSON.stringify(createReviewAppPayload.deployment)},
              deploymentStatus: 'pending',
              logsPort: 327701,
              subdomain: '${payload.deployment.environment}'
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
